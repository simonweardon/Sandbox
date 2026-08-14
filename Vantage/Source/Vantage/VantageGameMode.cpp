#include "VantageGameMode.h"

#include "DesertBuilder.h"
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

	UE_LOG(LogVantage, Log, TEXT("Level built. Spawn point at %s."), *SpawnLocation.ToCompactString());
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

	UE_LOG(LogVantage, Log, TEXT("Wave %d: %d shamblers."), Wave, Count);
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

	if (const APlayerController* PC = World->GetFirstPlayerController())
	{
		if (AVantageCharacter* Player = Cast<AVantageCharacter>(PC->GetPawn()))
		{
			Player->Revive(SpawnLocation);
		}
	}

	BeginIntermission();
}
