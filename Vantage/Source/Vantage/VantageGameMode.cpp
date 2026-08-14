#include "VantageGameMode.h"

#include "DesertBuilder.h"
#include "ObjectiveCache.h"
#include "VantageCharacter.h"
#include "VantageHUD.h"
#include "ZombieCharacter.h"

#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerStart.h"
#include "TimerManager.h"

DEFINE_LOG_CATEGORY_STATIC(LogVantage, Log, All);

AVantageGameMode::AVantageGameMode()
{
	DefaultPawnClass = AVantageCharacter::StaticClass();
	HUDClass = AVantageHUD::StaticClass();
}

void AVantageGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	EnsureLevelBuilt();
}

AActor* AVantageGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
	// This runs inside RestartPlayer, before the pawn exists. Building here is
	// the safety net that makes the InitGame ordering assumption non-critical.
	EnsureLevelBuilt();

	if (SpawnPoint)
	{
		return SpawnPoint;
	}

	return Super::ChoosePlayerStart_Implementation(Player);
}

void AVantageGameMode::StartPlay()
{
	EnsureLevelBuilt();
	Super::StartPlay();

	// First wave gets a breather so the player can look around before it lands.
	BeginIntermission();
}

void AVantageGameMode::EnsureLevelBuilt()
{
	if (bLevelBuilt)
	{
		return;
	}

	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	bLevelBuilt = true;

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	if (ADesertBuilder* Builder = World->SpawnActor<ADesertBuilder>(
		FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
	{
		Builder->Build();
	}
	else
	{
		UE_LOG(LogVantage, Error, TEXT("Failed to spawn ADesertBuilder; the map will be empty."));
	}

	// Held on to directly rather than left for FindPlayerStart to discover, so
	// the spawn point does not depend on actor iteration order.
	SpawnPoint = World->SpawnActor<APlayerStart>(SpawnLocation, FRotator::ZeroRotator, SpawnParams);

	World->SpawnActor<AObjectiveCache>(ADesertBuilder::CacheLocation, FRotator::ZeroRotator, SpawnParams);

	// Cheap poll rather than a per-frame check on the character: extraction only
	// matters once, and a third of a second is well inside human reaction time.
	GetWorldTimerManager().SetTimer(
		ExtractionTimer, this, &AVantageGameMode::CheckExtraction, 0.33f, true);

	UE_LOG(LogVantage, Log, TEXT("Level built. Spawn point at %s, cache at %s."),
		*SpawnLocation.ToCompactString(), *ADesertBuilder::CacheLocation.ToCompactString());
}

// ---------------------------------------------------------------------------
// waves
// ---------------------------------------------------------------------------

void AVantageGameMode::BeginIntermission()
{
	bBetweenWaves = true;

	GetWorldTimerManager().SetTimer(
		IntermissionTimer, this, &AVantageGameMode::OnIntermissionElapsed, IntermissionSeconds, false);
}

float AVantageGameMode::GetSecondsToNextWave() const
{
	if (!bBetweenWaves)
	{
		return 0.f;
	}
	return GetWorldTimerManager().GetTimerRemaining(IntermissionTimer);
}

void AVantageGameMode::OnIntermissionElapsed()
{
	bBetweenWaves = false;
	StartWave(Wave + 1);
}

void AVantageGameMode::StartWave(int32 WaveNumber)
{
	Wave = WaveNumber;

	// Grows steadily rather than sharply - the pressure should come from the
	// reload window, not from the count alone.
	const int32 Count = BaseWaveSize + (Wave - 1) * 2;

	for (int32 Index = 0; Index < Count; ++Index)
	{
		SpawnZombie(SpawnSalt++);
	}

	// A standing group around the vault, so the objective is defended rather
	// than merely distant. These are on top of the wave itself.
	const int32 Guards = 3 + Wave;
	SpawnVaultGuards(Guards, SpawnSalt);
	SpawnSalt += Guards;

	UE_LOG(LogVantage, Log, TEXT("Wave %d: %d shamblers, %d around the vault."), Wave, Count, Guards);
}

void AVantageGameMode::SpawnVaultGuards(int32 Count, int32 Seed)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	for (int32 Index = 0; Index < Count; ++Index)
	{
		FRandomStream Stream(Seed * 7919 + Index * 613 + Wave * 29);

		// Scattered in front of the vault door, between it and the player.
		const FVector At(
			Stream.FRandRange(-900.f, 900.f),
			Stream.FRandRange(3500.f, 4150.f),
			120.f);

		AZombieCharacter* Zombie = World->SpawnActor<AZombieCharacter>(
			At, FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f), SpawnParams);

		if (Zombie)
		{
			Zombie->Randomise(Seed + Index * 31);
			++ZombiesAlive;
		}
	}
}

void AVantageGameMode::SpawnZombie(int32 Seed)
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FRandomStream Stream(Seed * 7919 + Wave * 131);

	// Spawn on a ring well outside the player's field of interest, so they walk
	// in out of the haze rather than appearing in front of you.
	const float Angle = Stream.FRandRange(0.f, 360.f);
	const float Distance = Stream.FRandRange(1900.f, ADesertBuilder::ArenaRadius);

	const FVector At(
		FMath::Cos(FMath::DegreesToRadians(Angle)) * Distance,
		FMath::Sin(FMath::DegreesToRadians(Angle)) * Distance,
		120.f);

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AdjustIfPossibleButAlwaysSpawn;

	AZombieCharacter* Zombie = World->SpawnActor<AZombieCharacter>(
		At, FRotator(0.f, Stream.FRandRange(0.f, 360.f), 0.f), SpawnParams);

	if (Zombie)
	{
		Zombie->Randomise(Seed);
		++ZombiesAlive;
	}
}

void AVantageGameMode::NotifyZombieKilled()
{
	++Kills;
	ZombiesAlive = FMath::Max(ZombiesAlive - 1, 0);

	if (ZombiesAlive == 0 && !bBetweenWaves && !bPlayerDown)
	{
		BeginIntermission();
	}
}

// ---------------------------------------------------------------------------
// death and restart
// ---------------------------------------------------------------------------

void AVantageGameMode::NotifyPlayerDown()
{
	if (bPlayerDown)
	{
		return;
	}

	bPlayerDown = true;
	GetWorldTimerManager().ClearTimer(IntermissionTimer);

	UE_LOG(LogVantage, Log, TEXT("Player down on wave %d with %d kills."), Wave, Kills);

	GetWorldTimerManager().SetTimer(RestartTimer, this, &AVantageGameMode::RestartRun, 4.f, false);
}

void AVantageGameMode::NotifyCacheTaken()
{
	if (Objective != EVantageObjective::FetchCache)
	{
		return;
	}

	Objective = EVantageObjective::ReturnToExtraction;
	UE_LOG(LogVantage, Log, TEXT("Cache taken on wave %d. Run it back."), Wave);
}

void AVantageGameMode::CheckExtraction()
{
	if (Objective != EVantageObjective::ReturnToExtraction || bPlayerDown)
	{
		return;
	}

	const UWorld* World = GetWorld();
	const APlayerController* PC = World ? World->GetFirstPlayerController() : nullptr;
	const AVantageCharacter* Player = PC ? Cast<AVantageCharacter>(PC->GetPawn()) : nullptr;
	if (!Player)
	{
		return;
	}

	const FVector Pad = ADesertBuilder::ExtractionLocation;
	if (FVector::DistSquared2D(Player->GetActorLocation(), Pad) > ExtractionRadius * ExtractionRadius)
	{
		return;
	}

	Objective = EVantageObjective::Complete;
	GetWorldTimerManager().ClearTimer(IntermissionTimer);

	UE_LOG(LogVantage, Log, TEXT("Extracted on wave %d with %d kills."), Wave, Kills);

	// Let the win sit for a moment, then set the whole thing up again.
	GetWorldTimerManager().SetTimer(RestartTimer, this, &AVantageGameMode::RestartRun, 8.f, false);
}

FText AVantageGameMode::GetObjectiveText() const
{
	switch (Objective)
	{
	case EVantageObjective::FetchCache:
		return FText::FromString(TEXT("Reach the vault tower to the north"));

	case EVantageObjective::ReturnToExtraction:
		return FText::FromString(TEXT("Carry the cache back to the beacon"));

	default:
		return FText::FromString(TEXT("Extracted"));
	}
}

FVector AVantageGameMode::GetObjectiveLocation() const
{
	switch (Objective)
	{
	case EVantageObjective::FetchCache:
		return ADesertBuilder::VaultDoorLocation + FVector(0.f, 0.f, 260.f);

	case EVantageObjective::ReturnToExtraction:
		return ADesertBuilder::ExtractionLocation + FVector(0.f, 0.f, 620.f);

	default:
		return ADesertBuilder::ExtractionLocation;
	}
}

void AVantageGameMode::RestartRun()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	// Clear the field. Iterating actors is fine here - it happens once per death,
	// not per frame.
	for (TActorIterator<AZombieCharacter> It(World); It; ++It)
	{
		It->Destroy();
	}

	ZombiesAlive = 0;
	Kills = 0;
	Wave = 0;
	bPlayerDown = false;

	// Put the cache back, whether the last run ended in a death or a win.
	for (TActorIterator<AObjectiveCache> It(World); It; ++It)
	{
		It->Destroy();
	}

	Objective = EVantageObjective::FetchCache;

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	World->SpawnActor<AObjectiveCache>(ADesertBuilder::CacheLocation, FRotator::ZeroRotator, SpawnParams);

	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		if (AVantageCharacter* Player = Cast<AVantageCharacter>(PC->GetPawn()))
		{
			Player->Revive(SpawnLocation);
		}
	}

	BeginIntermission();
}
