#include "VantageGameMode.h"

#include "FacilityBuilder.h"
#include "VantageCharacter.h"
#include "VantageHUD.h"

#include "Engine/World.h"
#include "GameFramework/PlayerStart.h"

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

	if (AFacilityBuilder* Builder = World->SpawnActor<AFacilityBuilder>(
		FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
	{
		Builder->Build();
	}
	else
	{
		UE_LOG(LogVantage, Error, TEXT("Failed to spawn AFacilityBuilder; the level will be empty."));
	}

	// Held on to directly rather than left for FindPlayerStart to discover, so
	// the spawn point does not depend on actor iteration order.
	SpawnPoint = World->SpawnActor<APlayerStart>(SpawnLocation, FRotator::ZeroRotator, SpawnParams);

	UE_LOG(LogVantage, Log, TEXT("Level built. Spawn point at %s."), *SpawnLocation.ToCompactString());
}

void AVantageGameMode::CollectShard()
{
	ShardsCollected = FMath::Min(ShardsCollected + 1, ShardsRequired);
}

void AVantageGameMode::CompleteDemo()
{
	if (bComplete)
	{
		return;
	}

	bComplete = true;
	CompletionTime = GetWorld() ? GetWorld()->GetTimeSeconds() : 0.f;
}

float AVantageGameMode::GetTimeSinceCompletion() const
{
	if (!bComplete || !GetWorld())
	{
		return 0.f;
	}
	return GetWorld()->GetTimeSeconds() - CompletionTime;
}

FText AVantageGameMode::GetObjectiveText() const
{
	if (bComplete)
	{
		return FText::FromString(TEXT("Vault core extracted."));
	}

	if (bVaultOpen)
	{
		return FText::FromString(TEXT("Objective: reach the vault terminal"));
	}

	if (ShardsCollected >= ShardsRequired)
	{
		return FText::FromString(TEXT("Objective: unseal the blast door"));
	}

	return FText::FromString(FString::Printf(
		TEXT("Objective: recover %d resonance shards"), ShardsRequired));
}
