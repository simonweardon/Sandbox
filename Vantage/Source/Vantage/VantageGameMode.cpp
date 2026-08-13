#include "VantageGameMode.h"

#include "FacilityBuilder.h"
#include "VantageCharacter.h"
#include "VantageHUD.h"

#include "Engine/World.h"
#include "GameFramework/PlayerStart.h"

AVantageGameMode::AVantageGameMode()
{
	DefaultPawnClass = AVantageCharacter::StaticClass();
	HUDClass = AVantageHUD::StaticClass();
}

void AVantageGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
	Super::InitGame(MapName, Options, ErrorMessage);
	BuildLevel();
}

void AVantageGameMode::BuildLevel()
{
	UWorld* World = GetWorld();
	if (!World)
	{
		return;
	}

	FActorSpawnParameters SpawnParams;
	SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	if (AFacilityBuilder* Builder = World->SpawnActor<AFacilityBuilder>(
		FVector::ZeroVector, FRotator::ZeroRotator, SpawnParams))
	{
		Builder->Build();
	}

	// Spawned here rather than placed, so the default FindPlayerStart logic picks
	// it up when the pawn spawns a moment from now.
	World->SpawnActor<APlayerStart>(FVector(-480.f, 0.f, 110.f), FRotator(0.f, 0.f, 0.f), SpawnParams);
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
